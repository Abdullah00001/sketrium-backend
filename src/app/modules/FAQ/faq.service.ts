import FAQ from './faq.model';


export const getAllFAQsService = async () => {
  const faqs = await FAQ.find({ isActive: true }).sort({ order: 1 });
  return faqs;
};

export const createFAQService = async (req: any) => {
  const { category, question, answer, order } = req.body;

  const newFaq = await FAQ.create({
   
    question,
    answer,
  
  });

  return newFaq;
};


export const updateFAQService = async (req: any) => {
  const { id } = req.params;
  const updateData = req.body;

  const updatedFaq = await FAQ.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  return updatedFaq;
};

// ৪. FAQ ডিলিট করার সার্ভিস (এডমিনের জন্য)
export const deleteFAQService = async (req: any) => {
  const { id } = req.params;
  const deletedFaq = await FAQ.findByIdAndDelete(id);
  return deletedFaq;
};

export const FAQService = {
  getAllFAQsService,
  createFAQService,
  updateFAQService,
  deleteFAQService
};